import {
  defaultData,
  type BugRepository,
} from "./bugRepository";
import type {
  BugCounterData,
  EnvironmentDefinition,
  NewBugRegistration,
} from "../types";

const STORAGE_KEY = "bug-counter:v1:local";

const FALLBACK_ENVIRONMENT_COLOR = "#64748b";
const NEW_ENVIRONMENT_COLOR = "#4f6bed";

function normalizeEnvironments(values: unknown[]): EnvironmentDefinition[] {
  const environments = new Map<string, EnvironmentDefinition>();
  for (const value of values) {
    const environment = typeof value === "string"
      ? { name: value, color: FALLBACK_ENVIRONMENT_COLOR }
      : value as Partial<EnvironmentDefinition>;
    const name = environment.name?.trim();
    if (!name) continue;
    environments.set(name, {
      name,
      color: /^#[0-9a-f]{6}$/i.test(environment.color ?? "")
        ? environment.color!
        : FALLBACK_ENVIRONMENT_COLOR,
    });
  }
  return [...environments.values()];
}

function normalize(data: BugCounterData): BugCounterData {
  return {
    registrations: Array.isArray(data.registrations) ? data.registrations : [],
    severities: defaultData.severities,
    environments: normalizeEnvironments(
      Array.isArray(data.environments) ? data.environments : defaultData.environments,
    ),
  };
}

export class LocalStorageBugRepository implements BugRepository {
  async load() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultData);

    try {
      return normalize(JSON.parse(saved) as BugCounterData);
    } catch {
      return structuredClone(defaultData);
    }
  }

  async register(bug: NewBugRegistration) {
    const data = await this.load();
    const environmentName = bug.environment.trim();
    const existingEnvironment = data.environments.find(
      (environment) => environment.name === environmentName,
    );
    const next = normalize({
      registrations: [
        {
          id: crypto.randomUUID(),
          severity: bug.severity.trim(),
          environment: environmentName,
          description: bug.description?.trim() || undefined,
          registeredAt: new Date().toISOString(),
        },
        ...data.registrations,
      ],
      severities: data.severities,
      environments: [
        ...data.environments.filter((item) => item.name !== environmentName),
        {
          name: environmentName,
          color: existingEnvironment?.color ?? NEW_ENVIRONMENT_COLOR,
        },
      ],
    });
    this.save(next);
    return next;
  }

  async delete(id: string) {
    const data = await this.load();
    const next = {
      ...data,
      registrations: data.registrations.filter((bug) => bug.id !== id),
    };
    this.save(next);
    return next;
  }

  async deleteEnvironment(name: string) {
    const data = await this.load();
    const next = {
      ...data,
      registrations: data.registrations.filter((bug) => bug.environment !== name),
      environments: data.environments.filter((environment) => environment.name !== name),
    };
    this.save(next);
    return next;
  }

  async updateEnvironmentColor(name: string, color: string) {
    const data = await this.load();
    const next = {
      ...data,
      environments: data.environments.map((environment) =>
        environment.name === name ? { ...environment, color } : environment,
      ),
    };
    this.save(next);
    return next;
  }

  async reset() {
    const data = await this.load();
    const next = { ...data, registrations: [] };
    this.save(next);
    return next;
  }

  private save(data: BugCounterData) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}
