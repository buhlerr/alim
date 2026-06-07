import { z } from "zod";

export const coolifyConfigSchema = z.object({
  baseUrl: z.string().url("Enter a valid URL, e.g. https://coolify.example.com"),
  apiToken: z.string().min(1, "API token is required"),
});
export type CoolifyConfigInput = z.infer<typeof coolifyConfigSchema>;

export const BUILD_PACKS = ["nixpacks", "dockerfile", "static", "dockercompose"] as const;

export const createApplicationSchema = z.object({
  project_uuid: z.string().min(1, "Project is required"),
  server_uuid: z.string().min(1, "Server is required"),
  environment_name: z.string().min(1, "Environment is required"),
  git_repository: z.string().url("Enter a valid repository URL"),
  git_branch: z.string().min(1, "Branch is required"),
  build_pack: z.enum(BUILD_PACKS),
  ports_exposes: z
    .string()
    .regex(/^\d+(,\d+)*$/, "Comma-separated port numbers, e.g. 3000"),
  name: z.string().max(100).optional().or(z.literal("")),
  domains: z.string().max(500).optional().or(z.literal("")),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const envVarSchema = z.object({
  key: z
    .string()
    .min(1, "Key is required")
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, numbers, and underscores; cannot start with a number"),
  value: z.string().max(10_000),
});
export type EnvVarInput = z.infer<typeof envVarSchema>;

export const updateApplicationSchema = z.object({
  domains: z.string().max(500).optional().or(z.literal("")),
  build_command: z.string().max(2000).optional().or(z.literal("")),
  start_command: z.string().max(2000).optional().or(z.literal("")),
});
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
