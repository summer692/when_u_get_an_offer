interface Props {
  stage: string | null;
  error: string | null;
  onDismissError: () => void;
}

export function ProcessingOverlay({ stage, error, onDismissError }: Props) {
  if (!stage && !error) return null;

  return (
    <div className="fixed inset-0 z-40 bg-white/70 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full text-center">
        {error ? (
          <>
            <div className="text-4xl mb-4">⚠</div>
            <div className="text-lg font-medium mb-2">出错了</div>
            <div className="text-sm text-ink-500 mb-6 break-words">{error}</div>
            <button onClick={onDismissError} className="btn-primary">
              知道了
            </button>
          </>
        ) : (
          <>
            <div className="inline-block w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mb-6" />
            <div className="text-lg font-medium">{stage}</div>
          </>
        )}
      </div>
    </div>
  );
}
