fn main() {
    println!("cargo:rerun-if-changed=../.env.local");
    let _ = dotenvy::from_path("../.env.local");
    let ios = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios");
    let name = if ios { "NOVA_GOOGLE_IOS_CLIENT_ID" } else { "NOVA_GOOGLE_CLIENT_SECRET" };
    println!("cargo:rerun-if-env-changed={name}");
    if let Ok(value) = std::env::var(name) { println!("cargo:rustc-env={name}={value}"); }
    tauri_build::build()
}
