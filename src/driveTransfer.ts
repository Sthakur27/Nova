// Discovery and reconciliation share the native transfer lock.
let tail: Promise<unknown> = Promise.resolve();
export function driveTransfer<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation, operation);
  tail = result.catch(() => {});
  return result;
}
