export type ThrottledFunction<Arguments extends unknown[]> = ((...arguments_: Arguments) => void) & {
  cancel: () => void;
};

export function createThrottle<Arguments extends unknown[]>(
  callback: (...arguments_: Arguments) => void,
  delayMs: number,
): ThrottledFunction<Arguments> {
  let timer: number | undefined;
  let pendingArguments: Arguments | undefined;

  const throttled = (...arguments_: Arguments): void => {
    if (timer !== undefined) {
      pendingArguments = arguments_;
      return;
    }

    callback(...arguments_);
    timer = window.setTimeout(() => {
      timer = undefined;
      if (pendingArguments) {
        const latestArguments = pendingArguments;
        pendingArguments = undefined;
        callback(...latestArguments);
      }
    }, delayMs);
  };

  throttled.cancel = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    pendingArguments = undefined;
  };

  return throttled;
}
