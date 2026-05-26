export type ResourceChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'moved'
  | 'reordered';

export type ResourceChangeEvent = {
  action: ResourceChangeAction;
  resourceId: string;
  parentId: string | null;
  affectedParentIds: Array<string | null>;
};
