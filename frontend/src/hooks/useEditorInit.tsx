import { useEffect } from "react";
import { useExportStore, useViewStore } from "/src/stores";

export function useEditorInit() {
  const resetExportSettings = useExportStore((s) => s.reset);
  const setViewPositionAndScale = useViewStore((s) => s.setViewPositionAndScale);

  // Initialize editor state
  useEffect(() => {
    resetExportSettings();
    setViewPositionAndScale({ x: 0, y: 0 }, 1);
  }, []);
}
