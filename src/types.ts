export type BugRegistration = {
  id: string;
  severity: string;
  environment: string;
  description?: string;
  registeredAt: string;
};

export type EnvironmentDefinition = {
  name: string;
  color: string;
};

export type BugCounterData = {
  registrations: BugRegistration[];
  severities: string[];
  environments: EnvironmentDefinition[];
};

export type NewBugRegistration = Pick<
  BugRegistration,
  "severity" | "environment" | "description"
>;
