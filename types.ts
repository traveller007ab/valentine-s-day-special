
export interface RecipeCardData {
  title: string;
  subtitle: string;
  items?: string[];
  message?: string;
  emoji?: string;
  prepTimes?: { label: string; value: string }[];
}

export enum Direction {
  Next = 'next',
  Prev = 'prev'
}
