//! Desktop OAuth uses the system browser, PKCE, and an ephemeral loopback listener.
//! Tokens never cross the webview boundary or enter workspace files.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
#[cfg(desktop)]
use std::{io::{BufRead, BufReader, Write}, net::TcpListener, time::Instant};
use tauri::State;

#[cfg(desktop)]
const CLIENT_ID: &str = "864907687195-llg9gtagurj1kcjfc8hb9cbcnntpm4u9.apps.googleusercontent.com";
#[cfg(target_os = "ios")]
const CLIENT_ID: &str = match option_env!("NOVA_GOOGLE_IOS_CLIENT_ID") { Some(value) => value, None => "" };
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
#[derive(Default)]
pub struct DriveAuth { active: Arc<AtomicBool>, cancelled: Arc<AtomicBool> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status { account: Option<String>, connected: bool, email: Option<String>, configured: bool, error: Option<String> }
#[derive(Clone, Serialize, Deserialize)]
struct Credential { refresh_token: String, email: String }
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("Nova Google Drive", CLIENT_ID).map_err(|_| "Could not open the system credential store.".into())
}
#[cfg(desktop)]
fn secret() -> Result<&'static str, String> {
    option_env!("NOVA_GOOGLE_CLIENT_SECRET").filter(|s| !s.is_empty())
        .ok_or_else(|| "This build is missing Nova’s Google sign-in configuration. Install a configured desktop build.".into())
}
fn configured() -> bool {
    #[cfg(desktop)] { secret().is_ok() }
    #[cfg(target_os = "ios")] { CLIENT_ID.ends_with(".apps.googleusercontent.com") && CLIENT_ID.len() > 27 }
}
fn token_form<'a>(mut fields: Vec<(&'a str, &'a str)>) -> Result<Vec<(&'a str, &'a str)>, String> {
    fields.push(("client_id", CLIENT_ID));
    #[cfg(desktop)] fields.push(("client_secret", secret()?));
    Ok(fields)
}
// Native process memory survives webview reloads. Serialize the initial read so
// React remounts and simultaneous commands cannot stack credential prompts.
// Cache failures too: a denied prompt must not recur on every render or upload.
#[derive(Default)]
struct CredentialCache { value: Option<Result<Option<Credential>, String>> }
impl CredentialCache {
    fn load(&mut self, read: impl FnOnce() -> Result<Option<Credential>, String>) -> Result<Option<Credential>, String> {
        self.value.get_or_insert_with(read).clone()
    }
}
static CREDENTIAL: Mutex<CredentialCache> = Mutex::new(CredentialCache { value: None });
fn cached_credential() -> Result<Option<Credential>, String> {
    CREDENTIAL.lock().map_err(|_| "Google connection is unavailable.".to_string())?.load(|| {
        match entry()?.get_password() {
            Ok(value) => serde_json::from_str::<Credential>(&value).map(Some)
                .map_err(|_| "Saved Google connection is invalid. Disconnect and reconnect.".to_string()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Could not read the Google connection from the system credential store. Reconnect in Sync settings to try again.".into()),
        }
    })
}
fn connection_status(credential: Option<Credential>) -> Status {
    Status { account: credential.as_ref().map(|c| crate::revision(c.email.to_lowercase().as_bytes())), connected: credential.is_some(), email: credential.map(|c| c.email), configured: configured(), error: None }
}
fn status() -> Result<Status, String> {
    if !configured() { return Ok(connection_status(None)); }
    match cached_credential() {
        Ok(credential) => Ok(connection_status(credential)),
        Err(error) => Ok(Status { error: Some(error), ..connection_status(None) }),
    }
}
#[tauri::command]
pub async fn drive_status() -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(status).await.map_err(|_| "Could not read Google connection.".to_string())?
}
#[tauri::command]
pub async fn drive_cancel(app: tauri::AppHandle, auth: State<'_, DriveAuth>) -> Result<(), String> { auth.cancelled.store(true, Ordering::SeqCst);
    #[cfg(target_os = "ios")] { let _ = tauri::async_runtime::spawn_blocking(move || { use tauri::Manager; app.state::<tauri_plugin_nova_auth::Auth<tauri::Wry>>().call("cancel", serde_json::json!({})) }).await; }
    #[cfg(desktop)] let _ = app;
    Ok(())
}
struct ActiveGuard(Arc<AtomicBool>);
impl Drop for ActiveGuard { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
#[tauri::command]
pub async fn drive_connect(app: tauri::AppHandle, auth: State<'_, DriveAuth>) -> Result<Status, String> {
    if auth.active.swap(true, Ordering::SeqCst) { return Err("Google sign-in is already in progress.".into()); }
    auth.cancelled.store(false, Ordering::SeqCst);
    let guard = ActiveGuard(auth.active.clone());
    let cancelled = auth.cancelled.clone();
    tauri::async_runtime::spawn_blocking(move || { let _guard = guard; connect(&app, &cancelled) }).await
        .map_err(|_| "Google sign-in stopped unexpectedly. Try again.".to_string())?
}
#[tauri::command]
pub async fn drive_disconnect(auth: State<'_, DriveAuth>) -> Result<Status, String> {
    if auth.active.swap(true, Ordering::SeqCst) { return Err("Cancel sign-in before disconnecting.".into()); }
    let guard = ActiveGuard(auth.active.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let mut cache = CREDENTIAL.lock().map_err(|_| "Google connection is unavailable.".to_string())?;
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {
                cache.value = Some(Ok(None));
                Ok(connection_status(None))
            },
            Err(_) => Err("Could not remove the saved connection. Try again.".into()),
        }
    }).await.map_err(|_| "Could not disconnect Google Drive.".to_string())?
}
fn random() -> String { let mut bytes = [0u8; 32]; OsRng.fill_bytes(&mut bytes); URL_SAFE_NO_PAD.encode(bytes) }
#[cfg(any(desktop, test))]
fn callback(target: &str, state: &str) -> Result<Option<String>, String> {
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| "Invalid callback.".to_string())?;
    if url.path() != "/callback" { return Ok(None); }
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if params.get("state").map(String::as_str) != Some(state) { return Ok(None); }
    if params.contains_key("error") { return Err("Google sign-in was declined. Nothing was connected.".into()); }
    Ok(params.get("code").filter(|s| !s.is_empty()).cloned())
}
#[cfg(any(target_os = "ios", test))]
fn native_callback(value: &str, redirect: &str, state: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid sign-in callback.")?;
    let expected = reqwest::Url::parse(redirect).map_err(|_| "Invalid sign-in configuration.")?;
    if url.scheme() != expected.scheme() || url.host_str() != expected.host_str() || url.path() != expected.path() || url.fragment().is_some() {
        return Err("Unexpected sign-in callback.".into());
    }
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    if params.get("state").map(String::as_str) != Some(state) { return Err("Sign-in request did not match. Try again.".into()); }
    if params.contains_key("error") { return Err("Google sign-in was declined.".into()); }
    params.get("code").filter(|s| !s.is_empty()).cloned().ok_or("Missing sign-in code.".into())
}
fn connect(app: &tauri::AppHandle, cancelled: &AtomicBool) -> Result<Status, String> {
    if !configured() { return Err("This build is missing Google sign-in configuration.".into()); }
    #[cfg(desktop)]
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "Could not start Google sign-in on this device.".to_string())?;
    #[cfg(desktop)]
    listener.set_nonblocking(true).map_err(|_| "Could not start sign-in.".to_string())?;
    #[cfg(desktop)]
    let redirect = format!("http://127.0.0.1:{}/callback", listener.local_addr().map_err(|_| "Could not start sign-in.".to_string())?.port());
    #[cfg(target_os = "ios")]
    let redirect = format!("{}:/oauth2redirect", CLIENT_ID.split('.').rev().collect::<Vec<_>>().join("."));
    let state = random();
    let verifier = random();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
    url.query_pairs_mut().extend_pairs([
        ("client_id", CLIENT_ID), ("redirect_uri", &redirect), ("response_type", "code"),
        ("scope", SCOPE), ("state", &state), ("code_challenge", &challenge), ("code_challenge_method", "S256"),
        ("access_type", "offline"), ("prompt", "consent select_account"),
    ]);
    #[cfg(desktop)]
    let code = { let _ = app;
    webbrowser::open(url.as_str()).map_err(|_| "Could not open your browser. Check your default browser and try again.".to_string())?;
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if cancelled.load(Ordering::SeqCst) { return Err("Google sign-in cancelled.".into()); }
        if Instant::now() > deadline { return Err("Google sign-in timed out. Click Connect Google Drive to try again.".into()); }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                let mut line = String::new();
                use std::io::Read;
                if BufReader::new((&mut stream).take(8192)).read_line(&mut line).is_err() { continue; }
                let mut parts = line.split_whitespace();
                if parts.next() != Some("GET") { continue; }
                let result = callback(parts.next().unwrap_or(""), &state);
                let valid = !matches!(result, Ok(None));
                let message = if valid { "Google sign-in received. Return to Nova to finish connecting." } else { "This is not an active Nova sign-in request." };
                let _ = write!(stream, "HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}", if valid {"200 OK"} else {"400 Bad Request"}, message.len(), message);
                if let Some(code) = result? { break code; }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => return Err("Google sign-in callback failed. Try again.".into()),
        }
    }
    };
    #[cfg(target_os = "ios")]
    let code = {
        use tauri::Manager;
        let result = app.state::<tauri_plugin_nova_auth::Auth<tauri::Wry>>().call("authenticate", serde_json::json!({"url":url.as_str(),"scheme":redirect.split(':').next().unwrap()}))?;
        native_callback(result["url"].as_str().ok_or("Missing sign-in callback.")?, &redirect, &state)?
    };
    let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(30)).build().map_err(|_| "Could not connect to Google.".to_string())?;
    let response = client.post("https://oauth2.googleapis.com/token").form(&token_form(vec![
        ("code", code.as_str()),
        ("code_verifier", &verifier), ("redirect_uri", &redirect), ("grant_type", "authorization_code"),
    ])?).send().map_err(|_| "Could not reach Google. Check your connection and try again.".to_string())?;
    if !response.status().is_success() { return Err("Google could not complete sign-in. Please reconnect.".into()); }
    let token: serde_json::Value = response.json().map_err(|_| "Google returned an invalid sign-in response.".to_string())?;
    let access = token["access_token"].as_str().ok_or("Google did not return an access token.")?;
    let refresh = token["refresh_token"].as_str().ok_or("Google did not grant offline access. Please connect again.")?;
    let response = client.get("https://www.googleapis.com/drive/v3/about").query(&[("fields", "user(emailAddress)")])
        .bearer_auth(access).send().map_err(|_| "Could not verify your Google Drive account.".to_string())?;
    if !response.status().is_success() { return Err("Google Drive access was not granted. Reconnect and allow Nova’s Drive access.".into()); }
    let account: serde_json::Value = response.json().map_err(|_| "Could not read your Google Drive account.".to_string())?;
    let email = account["user"]["emailAddress"].as_str().ok_or("Google Drive did not return an account address.")?;
    if cancelled.load(Ordering::SeqCst) { return Err("Google sign-in cancelled.".into()); }
    let credential = Credential { refresh_token: refresh.to_owned(), email: email.to_owned() };
    let value = serde_json::to_string(&credential).map_err(|_| "Could not save connection.".to_string())?;
    let mut cache = CREDENTIAL.lock().map_err(|_| "Google connection is unavailable.".to_string())?;
    entry()?.set_password(&value).map_err(|_| "Could not save Google access in your system credential store. Nothing was connected.".to_string())?;
    cache.value = Some(Ok(Some(credential.clone())));
    Ok(connection_status(Some(credential)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn credential_reads_are_reused_including_missing_and_denied() {
        for result in [Ok(Some(Credential { refresh_token: "test".into(), email: "test@example.com".into() })), Ok(None), Err("denied".into())] {
            let mut cache = CredentialCache::default();
            let expected = result.as_ref().map(|c| c.as_ref().map(|c| c.email.clone()));
            let first = cache.load(|| result.clone());
            assert_eq!(first.as_ref().map(|c| c.as_ref().map(|c| c.email.clone())), expected);
            for _ in 0..30 {
                let next = cache.load(|| panic!("must not reread Keychain on HMR or transfer"));
                assert_eq!(next.as_ref().map(|c| c.as_ref().map(|c| c.email.clone())), expected);
            }
            cache.value = Some(Ok(None)); // disconnect invalidates the session
            assert!(cache.load(|| panic!("disconnect must not reread Keychain")).unwrap().is_none());
        }
    }
    #[test]
    fn native_callbacks_require_exact_redirect_and_state() {
        let redirect = "com.googleusercontent.apps.example:/oauth2redirect";
        assert_eq!(native_callback(&format!("{redirect}?state=expected&code=ok"), redirect, "expected").unwrap(), "ok");
        for value in [format!("{redirect}?state=wrong&code=ok"), format!("{redirect}?state=expected&error=access_denied"), "other:/oauth2redirect?state=expected&code=ok".into(), "com.googleusercontent.apps.example://attacker/oauth2redirect?state=expected&code=ok".into()] {
            assert!(native_callback(&value, redirect, "expected").is_err());
        }
    }
    #[test]
    fn rejects_unrelated_callbacks() {
        assert_eq!(callback("/callback?state=wrong&code=secret", "expected").unwrap(), None);
        assert_eq!(callback("/other?state=expected&code=secret", "expected").unwrap(), None);
        assert_eq!(callback("/callback?state=expected&code=hello%2Bworld", "expected").unwrap(), Some("hello+world".into()));
        assert!(callback("/callback?state=expected&error=access_denied", "expected").is_err());
    }
}

pub(crate) fn access_token() -> Result<String, String> {
    let credential = cached_credential()?.ok_or("Connect Google Drive before uploading.")?;
    let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(30)).build().map_err(|_| "Could not reach Google.".to_string())?;
    let response = client.post("https://oauth2.googleapis.com/token").form(&token_form(vec![
        ("refresh_token", credential.refresh_token.as_str()), ("grant_type", "refresh_token"),
    ])?).send().map_err(|_| "Google Drive is offline. Check your connection and retry.".to_string())?;
    if !response.status().is_success() { return Err("Google access expired or was revoked. Disconnect and reconnect in Sync settings.".into()); }
    let value: serde_json::Value = response.json().map_err(|_| "Invalid response from Google.".to_string())?;
    value["access_token"].as_str().map(str::to_owned).ok_or("Google did not return access. Reconnect Google Drive.".into())
}
pub(crate) fn transfer_guard(auth: &DriveAuth) -> Result<impl Drop, String> {
    if auth.active.swap(true, Ordering::SeqCst) { return Err("Another Google Drive operation is running. Try again when it finishes.".into()); }
    Ok(ActiveGuard(auth.active.clone()))
}

pub(crate) fn account_key() -> Result<String, String> {
    let credential = cached_credential()?.ok_or("Connect Google Drive first.")?;
    Ok(crate::revision(credential.email.to_lowercase().as_bytes()))
}
