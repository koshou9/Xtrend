import { useEffect, useState } from "react";

/** Follow other windows while clean; preserve an in-progress edit and expose a conflict. */
export function useSyncedText(
  latest: string,
  normalize: (value: string) => string = (value) => value,
) {
  const [value, setValue] = useState(latest),
    [base, setBase] = useState(latest),
    [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (
      normalize(value) === normalize(base) ||
      normalize(value) === normalize(latest)
    ) {
      setValue(latest);
      setConflict(false);
    } else setConflict(true);
    setBase(latest);
  }, [latest]);
  const reset = () => {
    setValue(latest);
    setBase(latest);
    setConflict(false);
  };
  return [value, setValue, conflict, reset] as const;
}
