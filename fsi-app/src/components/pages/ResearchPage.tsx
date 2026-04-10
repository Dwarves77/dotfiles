"use client";

import { Dashboard } from "@/components/Dashboard";
import type { Source, ProvisionalSource, SourceConflict } from "@/types/source";

interface Props {
  initialSources: Source[];
  initialProvisionalSources: ProvisionalSource[];
  initialOpenConflicts: SourceConflict[];
}

export function ResearchPage(props: Props) {
  return (
    <Dashboard
      initialResources={[]}
      initialArchived={[]}
      changelog={{}}
      disputes={{}}
      xrefPairs={[]}
      supersessions={[]}
      auditDate=""
      initialSources={props.initialSources}
      initialProvisionalSources={props.initialProvisionalSources}
      initialOpenConflicts={props.initialOpenConflicts}
      page="research"
    />
  );
}
