import { useEffect, useState } from "react";
import { invoke } from "./resetLocalState";

export default function RegistryValidation({root, text, revision}: {root: string; text: string; revision: string}) {
  const [result, setResult] = useState<{root: string; text: string; revision: string; error: string} | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void invoke("validate_registry_document", {root, text, revision}).then(() => {
        if (!cancelled) setResult({root, text, revision, error: ""});
      }).catch(error => { if (!cancelled) setResult({root, text, revision, error: String(error)}); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [root, text, revision]);
  const current = result?.root === root && result.text === text && result.revision === revision ? result : null;
  return <div className="registry-validation">
    <p>Workspace metadata · Save explicitly with Cmd/Ctrl-S. Invalid changes stay in your recovery draft. Cloud identity and tracking fields are managed by Nova.</p>
    {!current ? <p role="status">Validating .nova…</p> : current.error ? <p role="alert">Cannot save: {current.error}</p> : <p role="status">.nova is valid.</p>}
  </div>;
}
