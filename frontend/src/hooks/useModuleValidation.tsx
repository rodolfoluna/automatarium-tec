import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useModuleStore, useProjectStore } from "/src/stores";

/** En Automatarium Tec el editor siempre trabaja sobre una entrega (módulo) */
export function useModuleValidation() {
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.project);
  const currentModule = useModuleStore((s) => s.module);

  useEffect(() => {
    if (!project || !currentModule || !currentModule.projects.some((p) => p._id === project._id)) {
      navigate("/new");
    }
  }, [project, currentModule]);
}
