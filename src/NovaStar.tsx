export default function NovaStar({ size }: { size: number }) {
  return (
    <svg className="nova-star" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 14.7 9.3 22 12 14.7 14.7 12 22 9.3 14.7 2 12 9.3 9.3Z" />
    </svg>
  );
}
