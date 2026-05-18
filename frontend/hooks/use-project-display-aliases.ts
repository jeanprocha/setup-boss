"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readProjectDisplayAliases,
  writeProjectDisplayAliases,
  resolveProjectListLabel,
  type ProjectDisplayAliases,
} from "@/lib/projects/project-display-aliases";

export function useProjectDisplayAliases() {
  const [aliases, setAliases] = useState<ProjectDisplayAliases>({});

  useEffect(() => {
    setAliases(readProjectDisplayAliases());
  }, []);

  const setAlias = useCallback((projectId: string, nickname: string) => {
    const trimmed = nickname.trim();
    setAliases((prev) => {
      const next = { ...prev };
      if (!trimmed) delete next[projectId];
      else next[projectId] = trimmed;
      writeProjectDisplayAliases(next);
      return next;
    });
  }, []);

  const clearAlias = useCallback((projectId: string) => {
    setAliases((prev) => {
      if (!(projectId in prev)) return prev;
      const next = { ...prev };
      delete next[projectId];
      writeProjectDisplayAliases(next);
      return next;
    });
  }, []);

  const labelFor = useCallback(
    (projectId: string, serverDisplayName: string) =>
      resolveProjectListLabel(projectId, serverDisplayName, aliases),
    [aliases],
  );

  return { aliases, setAlias, clearAlias, labelFor };
}
