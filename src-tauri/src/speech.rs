//! Bounded, local dictation. No note text or audio is sent over the network.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const MODEL_BYTES: u64 = 77_704_715;
const MODEL_SHA256: &str = "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f";
const RATE: usize = 16_000;
const MAX_SECONDS: usize = 120;
const MAX_SAMPLES: usize = RATE * MAX_SECONDS;
const CANCELLED: &str = "Dictation cancelled.";
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Default)]
pub struct SpeechState {
    session: Mutex<Option<Session>>,
    installing: AtomicBool,
    transcribing: AtomicBool,
}
struct Session {
    id: String,
    cancel: Arc<AtomicBool>,
    stop: mpsc::Sender<()>,
    stopping: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<Result<String, String>>>,
}
struct FlagGuard<'a>(&'a AtomicBool);
impl Drop for FlagGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Transcript {
    session_id: String,
    text: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureEnded {
    session_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechStatus {
    ready: bool,
    model_bytes: u64,
    max_seconds: usize,
}
fn model_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(err)?
        .join("speech")
        .join("ggml-tiny.en.bin"))
}
#[tauri::command]
pub fn speech_status(app: tauri::AppHandle) -> Result<SpeechStatus, String> {
    Ok(SpeechStatus {
        ready: fs::metadata(model_path(&app)?)
            .map(|m| m.len() == MODEL_BYTES)
            .unwrap_or(false),
        model_bytes: MODEL_BYTES,
        max_seconds: MAX_SECONDS,
    })
}
fn download_model(path: &Path, mut progress: impl FnMut(u32)) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Missing model folder")?).map_err(err)?;
    let client = reqwest::blocking::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(err)?;
    let mut response = client
        .get(MODEL_URL)
        .send()
        .map_err(|e| {
            format!("Couldn't download the speech model. Check your connection and retry. {e}")
        })?
        .error_for_status()
        .map_err(err)?;
    let mut file = tempfile::NamedTempFile::new_in(path.parent().unwrap()).map_err(err)?;
    let mut hash = Sha256::new();
    let mut total = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    let mut last_percent = 101;
    loop {
        let count = response.read(&mut buffer).map_err(err)?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > MODEL_BYTES {
            return Err("The model download has an unexpected size. Please retry.".into());
        }
        hash.update(&buffer[..count]);
        file.write_all(&buffer[..count]).map_err(err)?;
        let percent = (total * 100 / MODEL_BYTES) as u32;
        if percent != last_percent {
            progress(percent);
            last_percent = percent;
        }
    }
    if total != MODEL_BYTES || format!("{:x}", hash.finalize()) != MODEL_SHA256 {
        return Err(
            "The speech model failed its integrity check. Please retry the download.".into(),
        );
    }
    file.as_file().sync_all().map_err(err)?;
    file.persist(path).map_err(err)?;
    Ok(())
}
#[tauri::command]
pub async fn speech_download(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SpeechState>();
        if state.installing.swap(true, Ordering::SeqCst) {
            return Err("The model is already downloading.".into());
        }
        let _guard = FlagGuard(&state.installing);
        if state.session.lock().map_err(err)?.is_some() {
            return Err("Finish dictation before downloading the model.".into());
        }
        download_model(&model_path(&app)?, |percent| {
            let _ = app.emit("speech:download-progress", percent);
        })
    })
    .await
    .map_err(err)?
}

// Weighted box-filter resampling: capture retains only 16 kHz mono, even when
// a device supplies high-rate stereo. At most 7.68 MB of float audio is kept.
struct AudioBuffer {
    samples: Vec<f32>,
    sum: f64,
    weight: f64,
    ratio: f64,
}
impl AudioBuffer {
    fn new(rate: u32) -> Self {
        Self {
            samples: Vec::with_capacity(MAX_SAMPLES),
            sum: 0.0,
            weight: 0.0,
            ratio: rate as f64 / RATE as f64,
        }
    }
    fn push(&mut self, value: f32) {
        let mut remaining: f64 = 1.0;
        while remaining > 1e-9 && self.samples.len() < MAX_SAMPLES {
            let take = remaining.min(self.ratio - self.weight);
            self.sum += value as f64 * take;
            self.weight += take;
            remaining -= take;
            if self.weight >= self.ratio - 1e-9 {
                self.samples.push((self.sum / self.ratio) as f32);
                self.sum = 0.0;
                self.weight = 0.0;
            }
        }
    }
}
fn make_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    audio: Arc<Mutex<AudioBuffer>>,
    failure: Arc<Mutex<Option<String>>>,
    stopping: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let channels = config.channels as usize;
    device.build_input_stream(config, move |data: &[T], _| {
        if stopping.load(Ordering::SeqCst) { return; }
        if let Ok(mut audio) = audio.lock() {
            for frame in data.chunks_exact(channels) {
                if audio.samples.len() == MAX_SAMPLES {break;}
                let value = frame.iter().map(|s| <f32 as cpal::FromSample<T>>::from_sample_(*s)).sum::<f32>() / channels as f32;
                audio.push(if value.is_finite() {value.clamp(-1.0,1.0)} else {0.0});
            }
        }
    }, move |error| {if let Ok(mut value) = failure.lock() {*value = Some(format!("Microphone disconnected or unavailable: {error}"));}}, None).map_err(|e| format!("Couldn't open the microphone. Allow Nova in your system's microphone privacy settings. {e}"))
}
fn capture(
    cancel: Arc<AtomicBool>,
    stop: mpsc::Receiver<()>,
    ready: mpsc::Sender<Result<(), String>>,
    path: PathBuf,
    stopping: Arc<AtomicBool>,
    mut partial: impl FnMut(String),
) -> Result<String, String> {
    let mut run = || {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No microphone found. Connect a microphone and try again.")?;
        let supported = device.default_input_config().map_err(err)?;
        let config: cpal::StreamConfig = supported.clone().into();
        if config.channels == 0 || config.sample_rate.0 == 0 {
            return Err("The microphone returned an invalid format.".into());
        }
        let audio = Arc::new(Mutex::new(AudioBuffer::new(config.sample_rate.0)));
        let failure = Arc::new(Mutex::new(None));
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => {
                make_stream::<f32>(&device, &config, audio.clone(), failure.clone(), stopping.clone())?
            }
            cpal::SampleFormat::I16 => {
                make_stream::<i16>(&device, &config, audio.clone(), failure.clone(), stopping.clone())?
            }
            cpal::SampleFormat::U16 => {
                make_stream::<u16>(&device, &config, audio.clone(), failure.clone(), stopping.clone())?
            }
            cpal::SampleFormat::I32 => {
                make_stream::<i32>(&device, &config, audio.clone(), failure.clone(), stopping.clone())?
            }
            cpal::SampleFormat::F64 => {
                make_stream::<f64>(&device, &config, audio.clone(), failure.clone(), stopping.clone())?
            }
            format => return Err(format!("Unsupported microphone sample format: {format}")),
        };
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        let mut decoder = load_decoder(&path)?;
        stream.play().map_err(err)?;
        let _ = ready.send(Ok(()));
        let start = Instant::now();
        let mut last_update = Instant::now();
        loop {
            if cancel.load(Ordering::SeqCst) || start.elapsed().as_secs() >= MAX_SECONDS as u64 {
                break;
            }
            if let Some(error) = failure.lock().map_err(err)?.clone() {
                return Err(error);
            }
            if last_update.elapsed() >= Duration::from_secs(1) {
                // Only one inference at a time; capture continues on CPAL's callback.
                // Release the audio lock before decoding so the microphone never waits.
                let samples = audio.lock().map_err(err)?.samples.clone();
                if let Ok(text) = decode(&mut decoder, &samples, cancel.clone()) {
                    if !cancel.load(Ordering::SeqCst) { partial(text); }
                }
                last_update = Instant::now();
            }
            if !matches!(
                stop.recv_timeout(Duration::from_millis(100)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ) {
                break;
            }
        }
        drop(stream);
        if cancel.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        let samples = std::mem::take(&mut audio.lock().map_err(err)?.samples);
        decode(&mut decoder, &samples, cancel.clone())
    };
    let result = run();
    if let Err(error) = &result {
        let _ = ready.send(Err(error.clone()));
    }
    result
}
#[tauri::command]
pub async fn speech_start(session_id: String, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SpeechState>();
        if !speech_status(app.clone())?.ready {
            return Err("Download the speech model first.".into());
        }
        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::channel();
        let cancel = Arc::new(AtomicBool::new(false));
        let stopping = Arc::new(AtomicBool::new(false));
        {
            let mut slot = state.session.lock().map_err(err)?;
            if slot.is_some()
                || state.transcribing.load(Ordering::SeqCst)
                || state.installing.load(Ordering::SeqCst)
            {
                return Err("Dictation is already busy. Try again when it finishes.".into());
            }
            let worker_cancel = cancel.clone();
            let worker_app = app.clone();
            let id = session_id.clone();
            let path = model_path(&app)?;
            let worker_stopping = stopping.clone();
            let worker = thread::spawn(move || {
                let result = capture(worker_cancel, stop_rx, ready_tx, path, worker_stopping, |text| {
                    let _ = worker_app.emit("speech:partial", Transcript { session_id: id.clone(), text });
                });
                let _ = worker_app.emit("speech:capture-ended", CaptureEnded { session_id: id });
                result
            });
            *slot = Some(Session {
                id: session_id.clone(),
                cancel,
                stop: stop_tx,
                stopping,
                worker: Some(worker),
            });
        }
        let result = ready_rx
            .recv_timeout(Duration::from_secs(60))
            .map_err(|_| {
                "Microphone setup timed out. Check Nova's microphone permission and try again."
                    .to_string()
            })
            .and_then(|r| r);
        if result.is_err() {
            let _ = speech_cancel(session_id, app.clone());
        }
        result
    })
    .await
    .map_err(err)?
}
fn load_decoder(path: &Path) -> Result<WhisperState, String> {
    let mut context_params = WhisperContextParameters::default();
    context_params.use_gpu(false);
    let context =
        WhisperContext::new_with_params(path.to_str().ok_or("Invalid model path")?, context_params)
            .map_err(|e| {
                format!("Couldn't load the speech model. Download it again from Voice typing. {e}")
            })?;
    context.create_state().map_err(err)

}
fn validate_audio(samples: &[f32], cancel: &AtomicBool) -> Result<(), String> {
    if samples.len() < RATE / 2 {
        return Err("That recording was too short. Speak for at least half a second.".into());
    }
    if samples.len() > MAX_SAMPLES {
        return Err("Recordings are limited to two minutes.".into());
    }
    let rms =
        (samples.iter().map(|x| (*x as f64).powi(2)).sum::<f64>() / samples.len() as f64).sqrt();
    if rms < 0.001 {
        return Err("No speech was detected. Check your microphone and try again.".into());
    }
    if cancel.load(Ordering::SeqCst) {
        return Err(CANCELLED.into());
    }
    Ok(())
}
#[cfg(test)]
pub fn transcribe(path: &Path, samples: &[f32], cancel: Arc<AtomicBool>) -> Result<String, String> {
    validate_audio(samples, &cancel)?;
    decode(&mut load_decoder(path)?, samples, cancel)
}
fn decode(state: &mut WhisperState, samples: &[f32], cancel: Arc<AtomicBool>) -> Result<String, String> {
    validate_audio(samples, &cancel)?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(
        thread::available_parallelism()
            .map(|n| n.get().min(4) as i32)
            .unwrap_or(2),
    );
    params.set_language(Some("en"));
    params.set_translate(false);
    params.set_no_context(true);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_print_special(false);
    // whisper-rs 0.16's closure trampoline has incompatible pointer indirection.
    // Use a direct AtomicBool pointer instead. `cancel` owns this allocation for
    // the entire synchronous state.full call; the callback only reads it.
    unsafe extern "C" fn should_abort(data: *mut std::ffi::c_void) -> bool {
        unsafe { (&*(data as *const AtomicBool)).load(Ordering::SeqCst) }
    }
    unsafe {
        params.set_abort_callback(Some(should_abort));
        params.set_abort_callback_user_data(Arc::as_ptr(&cancel) as *mut std::ffi::c_void);
    }
    state.full(params, samples).map_err(|e| {
        if cancel.load(Ordering::SeqCst) {
            CANCELLED.into()
        } else {
            format!("Transcription failed: {e}")
        }
    })?;
    let mut text = String::new();
    for segment in state.as_iter() {
        text.push_str(&segment.to_str().map_err(err)?);
    }
    if cancel.load(Ordering::SeqCst) {
        return Err(CANCELLED.into());
    }
    let text = text.trim().to_owned();
    if text.is_empty() {
        return Err(
            "No speech was detected. Try speaking a little closer to the microphone.".into(),
        );
    }
    Ok(text)
}
#[tauri::command]
pub async fn speech_finish(session_id: String, app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<SpeechState>();
        let worker = {
            let mut slot = state.session.lock().map_err(err)?;
            let session = slot
                .as_mut()
                .filter(|s| s.id == session_id)
                .ok_or("This dictation session has ended.")?;
            let worker = session.worker.take().ok_or("Already transcribing.")?;
            state.transcribing.store(true, Ordering::SeqCst);
            session.stopping.store(true, Ordering::SeqCst);
            let _ = session.stop.send(());
            worker
        };
        let _guard = FlagGuard(&state.transcribing);
        let result = worker
            .join()
            .map_err(|_| "The microphone worker stopped unexpectedly.".to_string())
            .and_then(|r| r);
        let mut slot = state.session.lock().map_err(err)?;
        if slot.as_ref().map(|s| s.id.as_str()) == Some(session_id.as_str()) {
            *slot = None;
        }
        result
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub fn speech_cancel(session_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<SpeechState>();
    let mut slot = state.session.lock().map_err(err)?;
    if slot.as_ref().map(|s| s.id.as_str()) == Some(session_id.as_str()) {
        if let Some(session) = slot.take() {
            session.cancel.store(true, Ordering::SeqCst);
            session.stopping.store(true, Ordering::SeqCst);
            let _ = session.stop.send(());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resampling_is_bounded_and_preserves_dc() {
        for rate in [8000, 16000, 44100, 48000, 96000] {
            let mut audio = AudioBuffer::new(rate);
            for _ in 0..rate {
                audio.push(0.25);
            }
            assert!((audio.samples.len() as isize - RATE as isize).abs() <= 1);
            assert!(audio.samples.iter().all(|x| (*x - 0.25).abs() < 0.00001));
        }
        let mut audio = AudioBuffer::new(16000);
        for _ in 0..MAX_SAMPLES + 20 {
            audio.push(0.5);
        }
        assert_eq!(audio.samples.len(), MAX_SAMPLES);
    }
    #[test]
    fn silence_and_short_audio_do_not_load_a_model() {
        let cancel = Arc::new(AtomicBool::new(false));
        assert!(
            transcribe(Path::new("missing"), &[0.0; 100], cancel.clone())
                .unwrap_err()
                .contains("too short")
        );
        assert!(transcribe(Path::new("missing"), &vec![0.0; 16000], cancel)
            .unwrap_err()
            .contains("No speech"));
    }
    #[test]
    #[ignore = "Downloads the 78 MB model and uses the upstream JFK audio fixture; run explicitly"]
    fn actual_whisper_transcription() {
        let dir = tempfile::tempdir().unwrap();
        let model = if let Some(path) = std::env::var_os("NOVA_SPEECH_TEST_MODEL") {
            PathBuf::from(path)
        } else {
            let path = dir.path().join("model.bin");
            download_model(&path, |_| {}).unwrap();
            path
        };
        let bytes = reqwest::blocking::get(
            "https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/samples/jfk.wav",
        )
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .unwrap();
        let reader = hound::WavReader::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(reader.spec().sample_rate, 16000);
        let samples: Vec<f32> = reader
            .into_samples::<i16>()
            .map(|x| x.unwrap() as f32 / 32768.0)
            .collect();
        let mut decoder = load_decoder(&model).unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        for seconds in [2, 4, 8] {
            let start = Instant::now();
            let partial = decode(&mut decoder, &samples[..RATE * seconds], cancel.clone()).unwrap();
            eprintln!("{seconds}s preview in {:?}: {partial}", start.elapsed());
            assert!(!partial.is_empty());
        }
        let text = decode(&mut decoder, &samples, cancel.clone()).unwrap();
        cancel.store(true, Ordering::SeqCst);
        assert_eq!(decode(&mut decoder, &samples, cancel).unwrap_err(), CANCELLED);
        assert!(
            text.to_lowercase().contains("ask not what your country"),
            "{text}"
        );
    }
}
