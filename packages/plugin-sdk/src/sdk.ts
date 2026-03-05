import type { WorkflowType } from 'src/enum.js';
import { hostFunctions } from 'src/host-functions.js';
import type {
  ConfigValue,
  WorkflowEventPayload,
  WorkflowResponse,
} from 'src/types.js';

export const wrapper = <
  T extends WorkflowType = WorkflowType,
  TConfig extends ConfigValue = ConfigValue
>(
  fn: (
    payload: WorkflowEventPayload<T, TConfig> & {
      functions: ReturnType<typeof hostFunctions>;
    }
  ) => WorkflowResponse<T> | undefined
) => {
  try {
    const input = Host.inputString();
    const event = JSON.parse(input) as WorkflowEventPayload<T, TConfig>;
    const debug = event.workflow.debug ?? false;

    if (debug) {
      console.trace(`Event trigger: ${event.trigger}`);
      console.trace(`Event type: ${event.type}`);
      console.trace(`Event data: ${JSON.stringify(event.data)}`);
      console.trace(`Event config: ${JSON.stringify(event.config)}`);
    }

    const response =
      fn({ ...event, functions: hostFunctions(event.workflow.authToken) }) ??
      {};

    if (debug) {
      console.trace(`Output workflow: ${JSON.stringify(response.workflow)}`);
      console.trace(`Output changes: ${JSON.stringify(response.changes)}`);
      console.trace(`Output data: ${JSON.stringify(response.data)}`);
    }

    const output = JSON.stringify(response);
    Host.outputString(output);
  } catch (error: Error | any) {
    console.error(`Unhandled plugin exception: ${error.message || error}`);
    return { workflow: { continue: false } };
  }
};
