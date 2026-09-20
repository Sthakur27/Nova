export function fileTitle(path = "") {
  const name = path.split(/[\\/]/).at(-1) || "Untitled";
  const extension = name.lastIndexOf(".");
  // Preserve extensionless files and leading-dot names such as .env.
  return extension > 0 ? name.slice(0, extension) : name;
}

export default function FileTitle({ path }: { path: string }) {
  const name = fileTitle(path);
  return <header className="file-heading">
    <h1 className="file-title" title={name} dir="auto">{name}</h1>
  </header>;
}
