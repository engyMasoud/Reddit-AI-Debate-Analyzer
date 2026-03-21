export interface Comment {
  id: number;
  postId: number;
  authorId: number;
  parentCommentId: number | null;
  text: string;
  upvotes: number;
  downvotes: number;
  createdAt: Date;
  updatedAt: Date;
}
