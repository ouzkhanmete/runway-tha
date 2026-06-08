import type { Rating } from "./rating";

export interface Review {
  id: string;
  appId: string;
  author: string;
  title: string;
  content: string;
  rating: Rating;
  version: string | null;
  submittedAt: Date;
}
