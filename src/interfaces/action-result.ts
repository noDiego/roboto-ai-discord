export interface ActionResult<T = any> {
  success : boolean;
  code: number;
  data?: T;
  message?: string;
  error?: string;
  replied?: boolean;
}
