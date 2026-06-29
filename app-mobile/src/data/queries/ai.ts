// AI helpers — product description generation via the generate-description edge
// function (Google Gemini, free tier). Inert until GEMINI_API_KEY is configured
// server-side (the endpoint returns AI_UNAVAILABLE, surfaced as a toast).
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../../lib/api';

export interface GenerateDescriptionInput {
  title: string;
  category?: string;
  condition?: string;
  keywords?: string;
}

export function useGenerateDescription() {
  return useMutation({
    mutationFn: async (input: GenerateDescriptionInput): Promise<string> => {
      const { description } = await apiPost<{ description: string }>({
        path: '/generate-description',
        body: input,
      });
      return description;
    },
  });
}
