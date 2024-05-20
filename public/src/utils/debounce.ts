
/**
 * Throttles calls make through a debouncer.
 *
 * If immediate, the first call will be made immediately. Any additional
 * calls within the wait period will be delayed until the wait period has
 * passed, at which point exactly one call (with the most recent callback)
 * will be made.
 *
 * If not immediate, the first call will be delayed until the wait period
 * has passed, at which point exactly one call (with the most recent callback)
 * will be made.
 *
 * Either way, this ensures that two calls will never be made within the
 * same wait period.
 *
 * @param wait_ms How long to wait between calls, in milliseconds
 * @param immediate Whether the first call outside of a cooldown should happen
 *                  immediately, or after the cooldown.
 * @param fn The function to call
 */
const debounce = (wait_ms: number, immediate: boolean) => {
  let timeout: number | null = null;
  let fn: Function | null = null;
  let args: any[] = [];
  const do_call = () => {
    if (fn) {
      fn(...args);
      fn = null;
      args = [];
    }
  };
  return (ffn: Function, ...fargs): void => {
    // This call will always happen, now or later, unless
    // another call happens within the cooldown period.
    fn = ffn;
    args = fargs;
    if (timeout !== null) {
      // In the middle of a cooldown. We've aleady overridden any existing
      // call, if applicable, and will be called once the cooldown is over.
      return;
    }
    if (immediate) {
      // If we're immediate, make the call, and clear the variables to
      // indicate that we shouldn't be called at the end of the timeout.
      do_call();
    }
    // Either way, start the cooldown, and call any function set to be called
    // once the cooldown finishes.
    timeout = setTimeout(() => {
      timeout = null;
      do_call();
    }, wait_ms);
  };
};

export default debounce;
export { debounce };
