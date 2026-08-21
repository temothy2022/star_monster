import type { PaginationProps } from "antd";

export const paginationSizeChanger: NonNullable<PaginationProps["showSizeChanger"]> = {
  showSearch: false,
  optionRender: (option) => `每页 ${String(option.value)}条`,
  labelRender: ({ value }) => `每页 ${String(value)}条`,
};
