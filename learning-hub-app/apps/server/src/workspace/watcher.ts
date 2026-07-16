import chokidar, { type FSWatcher } from "chokidar";

export interface WorkspaceWatcher {
  close: () => Promise<void>;
}

export function watchWorkspace(
  rootDir: string,
  onChange: () => void | Promise<void>,
  options: { debounceMs?: number } = {}
): WorkspaceWatcher {
  const debounceMs = options.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const watcher: FSWatcher = chokidar.watch(rootDir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 10
    }
  });

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void onChange();
    }, debounceMs);
  };

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);
  watcher.on("addDir", schedule);
  watcher.on("unlinkDir", schedule);

  return {
    close: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      await watcher.close();
    }
  };
}
