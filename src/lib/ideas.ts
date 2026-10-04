import { z } from 'zod';

const ideaSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1),
  createdAt: z.number().finite(),
});
const notebookSchema = z.object({ version: z.literal(1), ideas: z.array(ideaSchema) });

export type ProjectIdea = z.infer<typeof ideaSchema>;

export interface IdeaStorage {
  read: () => Promise<string | null>;
  write: (raw: string) => Promise<void>;
}

/** These are original notes, not a cache: failures must reach the editor. */
export function createIdeasStore(storage: IdeaStorage) {
  return {
    async load(): Promise<ProjectIdea[]> {
      const raw = await storage.read();
      return raw === null ? [] : notebookSchema.parse(JSON.parse(raw)).ideas;
    },
    async save(ideas: ProjectIdea[]): Promise<void> {
      const notebook = notebookSchema.parse({ version: 1, ideas });
      await storage.write(JSON.stringify(notebook));
    },
  };
}
