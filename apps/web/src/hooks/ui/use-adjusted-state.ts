import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * Local state that re-syncs when `source` changes (React docs "adjusting state
 * when a prop changes" pattern — setState during render, not in an effect).
 */
export function useAdjustedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [prevSource, setPrevSource] = useState(source);
  if (source !== prevSource) {
    setPrevSource(source);
    setValue(source);
  }
  return [value, setValue];
}
