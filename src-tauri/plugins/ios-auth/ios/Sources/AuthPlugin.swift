import AuthenticationServices
import UIKit
import Tauri

struct SignInArgs: Decodable { let url: String; let scheme: String }
struct OpenArgs: Decodable { let url: String }
final class NovaAuthPlugin: Plugin, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var pending: Invoke?
    private var generation = UUID()
    private var timeout: DispatchWorkItem?
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return manager.viewController!.view.window!
    }
    private func finish(_ url: URL?, _ error: String?) {
        timeout?.cancel(); timeout = nil
        let invoke = pending; pending = nil; session = nil
        if let url = url { invoke?.resolve(["url": url.absoluteString]) }
        else { invoke?.reject(error ?? "Google sign-in cancelled.") }
    }
    @objc func authenticate(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SignInArgs.self)
        DispatchQueue.main.async {
            guard self.pending == nil else { invoke.reject("Google sign-in is already open."); return }
            guard let url = URL(string: args.url), url.scheme == "https", url.host == "accounts.google.com",
                  self.manager.viewController?.view.window != nil else { invoke.reject("Unable to open Google sign-in."); return }
            self.pending = invoke
            let generation = UUID(); self.generation = generation
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: args.scheme) { url, error in
                DispatchQueue.main.async {
                    guard self.generation == generation else { return }
                    self.finish(url, error == nil ? nil : "Google sign-in cancelled or interrupted. Try again.")
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() { self.finish(nil, "Could not start Google sign-in."); return }
            let timeout = DispatchWorkItem { [weak self] in
                self?.session?.cancel(); self?.finish(nil, "Google sign-in timed out. Try again.")
            }
            self.timeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)
        }
    }
    @objc func cancel(_ invoke: Invoke) {
        DispatchQueue.main.async { self.session?.cancel(); self.finish(nil, "Google sign-in cancelled."); invoke.resolve([:]) }
    }
    @objc func openDrive(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(OpenArgs.self)
        DispatchQueue.main.async {
            guard let url = URL(string: args.url), url.scheme == "https", url.host == "drive.google.com",
                  (url.path.hasPrefix("/drive/folders/") || url.path.hasPrefix("/file/d/")) else { invoke.reject("Invalid Drive location."); return }
            UIApplication.shared.open(url) { opened in
                if opened { invoke.resolve([:]) } else { invoke.reject("Could not open Google Drive.") }
            }
        }
    }
}
@_cdecl("init_plugin_nova_auth")
func initPlugin() -> Plugin { NovaAuthPlugin() }
