use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};
tauri::ios_plugin_binding!(init_plugin_nova_auth);
pub struct Auth<R: Runtime>(PluginHandle<R>);
impl<R: Runtime> Auth<R> {
    pub fn call(&self, command: &str, payload: serde_json::Value) -> Result<serde_json::Value, String> {
        self.0.run_mobile_plugin(command, payload).map_err(|e| e.to_string())
    }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nova-auth").setup(|app, api| {
        app.manage(Auth(api.register_ios_plugin(init_plugin_nova_auth)?));
        Ok(())
    }).build()
}
