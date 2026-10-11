import { isItemUuid } from "./id-redirect.ts";

type ItemIdColumn = "id" | "legacy_id";

export function itemIdColumn(value: string): ItemIdColumn {
  return isItemUuid(value) ? "id" : "legacy_id";
}
