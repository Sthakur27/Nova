use serde::Deserialize;

#[derive(Deserialize)]
pub struct BlurRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

// Sync commands execute on the main thread, as required by AppKit.
#[tauri::command]
pub fn set_background_blur(
    window: tauri::WebviewWindow,
    regions: Vec<BlurRegion>,
) -> Result<(), String> {
    if regions.len() > 6
        || regions.iter().any(|r| {
            [r.x, r.y, r.width, r.height].iter().any(|v| !v.is_finite())
                || r.width < 0.0
                || r.height < 0.0
        })
    {
        return Err("Invalid background blur regions".into());
    }
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadOnly;
        use objc2_app_kit::{
            NSUserInterfaceItemIdentification, NSView, NSVisualEffectBlendingMode,
            NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindowOrderingMode,
        };
        use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};

        window
            .with_webview(move |platform| {
                // Work in the web content's visible viewport. On macOS the
                // WKWebView extends under the titlebar, while window.innerHeight
                // excludes that inset. Scaling against its full bounds leaves a
                // bright strip where the native blur and CSS tint no longer align.
                let Some(mtm) = MainThreadMarker::new() else {
                    return;
                };
                let webview = unsafe { &*platform.inner().cast::<NSView>() };
                let Some(view) = (unsafe { webview.superview() }) else {
                    return;
                };
                let identifier = NSString::from_str("nova-background-blur");
                let existing: Vec<_> = view
                    .subviews()
                    .iter()
                    .filter(|v| v.identifier().as_deref() == Some(&*identifier))
                    .collect();
                let Some(native_window) = webview.window() else {
                    return;
                };
                let bounds = webview.convertRect_fromView(native_window.contentLayoutRect(), None);
                for (index, region) in regions.iter().enumerate() {
                    let x = region.x.clamp(0.0, 1.0);
                    let y = region.y.clamp(0.0, 1.0);
                    let width = region.width.min(1.0 - x) * bounds.size.width;
                    let height = region.height.min(1.0 - y) * bounds.size.height;
                    let top = y * bounds.size.height;
                    let frame = NSRect::new(
                        NSPoint::new(
                            bounds.origin.x + x * bounds.size.width,
                            bounds.origin.y
                                + if webview.isFlipped() {
                                    top
                                } else {
                                    bounds.size.height - top - height
                                },
                        ),
                        NSSize::new(width, height),
                    );
                    let frame = view.convertRect_fromView(frame, Some(webview));
                    if let Some(effect) = existing.get(index) {
                        effect.setFrame(frame);
                    } else {
                        let effect = NSVisualEffectView::initWithFrame(
                            NSVisualEffectView::alloc(mtm),
                            frame,
                        );
                        effect.setIdentifier(Some(&identifier));
                        effect.setMaterial(NSVisualEffectMaterial::Sidebar);
                        effect.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
                        effect.setState(NSVisualEffectState::Active);
                        view.addSubview_positioned_relativeTo(
                            &effect,
                            NSWindowOrderingMode::Below,
                            Some(webview),
                        );
                    }
                }
                for effect in existing.iter().skip(regions.len()) {
                    effect.removeFromSuperview();
                }
            })
            .map_err(|e| e.to_string())?;
    }
    // Windows window-wide blur cannot implement independent frosted surfaces.
    #[cfg(not(target_os = "macos"))]
    let _ = window;
    Ok(())
}
