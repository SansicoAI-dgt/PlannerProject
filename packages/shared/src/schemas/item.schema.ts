import { z } from 'zod';

export const createItemSchema = z.object({
  partNumber: z.string().min(1, 'Part number wajib diisi'),
  description: z.string().min(1, 'Description wajib diisi'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
});

export const updateItemSchema = z.object({
  partNumber: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
