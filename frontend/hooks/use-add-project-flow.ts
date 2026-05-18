"use client";

import { useCallback, useState } from "react";

const initial = { open: false };

export function useAddProjectFlow(onRegistered?: () => void) {
  const [state, setState] = useState(initial);

  const close = useCallback(() => {
    setState(initial);
  }, []);

  const openAddProjectDialog = useCallback(() => {
    setState({ open: true });
  }, []);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close],
  );

  const handleRegistered = useCallback(() => {
    close();
    onRegistered?.();
  }, [close, onRegistered]);

  return {
    addProjectDialogProps: {
      open: state.open,
      onOpenChange,
      onRegistered: handleRegistered,
    },
    openAddProjectDialog,
  };
}
