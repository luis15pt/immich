import { WorkflowTrigger, WorkflowType } from 'src/enum';

export const triggerMap: Record<WorkflowTrigger, WorkflowType[]> = {
  [WorkflowTrigger.AssetCreate]: [WorkflowType.AssetV1],
  [WorkflowTrigger.PersonRecognized]: [WorkflowType.AssetV1],
};

export const getWorkflowTriggers = () =>
  Object.entries(triggerMap).map(([trigger, types]) => ({ trigger: trigger as WorkflowTrigger, types }));

/** some types extend other types and have implied compatibility */
const inferredMap: Record<WorkflowType, WorkflowType[]> = {
  [WorkflowType.AssetV1]: [],
  [WorkflowType.AssetPersonV1]: [WorkflowType.AssetV1],
};

const withImpliedItems = (type: WorkflowType): WorkflowType[] => [type, ...inferredMap[type]];

export const isMethodCompatible = (pluginMethod: { types: WorkflowType[] }, trigger: WorkflowTrigger) => {
  const validTypes = triggerMap[trigger];
  const pluginCompatibility = pluginMethod.types.map((type) => withImpliedItems(type));
  for (const requested of validTypes) {
    for (const pluginCompatibilityGroup of pluginCompatibility) {
      if (pluginCompatibilityGroup.includes(requested)) {
        return true;
      }
    }
  }

  return false;
};
