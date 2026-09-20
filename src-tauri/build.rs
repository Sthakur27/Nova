fn main() {
    println!("cargo:rerun-if-changed=../.env.local");
    println!("cargo:rerun-if-env-changed=NOVA_GOOGLE_CLIENT_SECRET");
    let _ = dotenvy::from_path("../.env.local");
    if let Ok(secret) = std::env::var("NOVA_GOOGLE_CLIENT_SECRET") {
        println!("cargo:rustc-env=NOVA_GOOGLE_CLIENT_SECRET={secret}");
    }
    tauri_build::build()
}
