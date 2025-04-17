export interface ActionResult<T = any> {
  success : boolean;
  code: number;
  result?: T;
  resultMsg?: string;
  error?: string;
  replied?: boolean;
}
