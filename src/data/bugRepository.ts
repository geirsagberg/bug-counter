import type { BugCounterData, NewBugRegistration } from "../types";

export interface BugRepository {
  load(): Promise<BugCounterData>;
  register(bug: NewBugRegistration): Promise<BugCounterData>;
  delete(id: string): Promise<BugCounterData>;
  deleteEnvironment(name: string): Promise<BugCounterData>;
  updateEnvironmentColor(name: string, color: string): Promise<BugCounterData>;
  reset(): Promise<BugCounterData>;
}

export const defaultData: BugCounterData = {
  registrations: [],
  severities: ["Low", "Medium", "High", "Critical"],
  environments: [],
};
