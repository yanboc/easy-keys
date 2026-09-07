// 本地内联 SVG 图标库：24 viewBox、1.8px 描边、round cap/join、currentColor 着色。
// 零联网原则：禁止引入 icon font / CDN / 第三方图标库运行时依赖。
import type { CSSProperties, ReactNode } from "react";

export type IconProps = {
  size?: number;
  style?: CSSProperties;
  className?: string;
};

function Svg({
  size = 16,
  style,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

/** 密钥 / 钥匙 */
export function KeyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.9 12.1 20 3" />
      <path d="M15.5 7.5l3 3" />
      <path d="M13 10l2 2" />
    </Svg>
  );
}

/** 闪电 / 测速 */
export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 4.5 13.5H11L10 22l9.5-11.5H13L13 2Z" />
    </Svg>
  );
}

/** 箱子 / 导出导入 */
export function BoxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 8v8l-9 5-9-5V8l9-5 9 5Z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v10" />
    </Svg>
  );
}

/** 叶子 / 环境变量 */
export function LeafIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 19C5 10 10.5 4.5 20 4c0 9.5-5.5 15-15 15Z" />
      <path d="M5 19c2.5-4.5 6-8.5 10.5-10.5" />
    </Svg>
  );
}

/** 齿轮 / 设置 */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

/** 锁 / 加密、锁定 */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

/** 眼睛 / 显示 */
export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/** 眼睛划线 / 隐藏 */
export function EyeOffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19.5C5.5 19.5 1.5 12 1.5 12a19.3 19.3 0 0 1 5.06-5.94" />
      <path d="M9.9 4.74A9.12 9.12 0 0 1 12 4.5c6.5 0 10.5 7.5 10.5 7.5a19.36 19.36 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M2 2l20 20" />
    </Svg>
  );
}

/** 复制 */
export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

/** 铅笔 / 编辑 */
export function EditIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </Svg>
  );
}

/** 垃圾桶 / 删除 */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

/** 磁盘 / 持久化保存 */
export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </Svg>
  );
}

/** 文件 */
export function FileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </Svg>
  );
}

/** 对勾圆圈 / 成功状态 */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </Svg>
  );
}

/** 三角感叹号 / 警告状态 */
export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

/** 指纹 / 生物识别 */
export function FingerprintIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6.6A9.5 9.5 0 0 1 21 12.5" />
      <path d="M3.2 12.5a8.5 8.5 0 0 1 1.2-4.2" />
      <path d="M7.4 20a17.5 17.5 0 0 0 1.1-7.5 3.5 3.5 0 0 1 7 0c0 2.6-.1 5.1-.5 7.5" />
      <path d="M12 12.7c0 2.9-.3 5.7-1 8.3" />
      <path d="M17.6 20.5c.8-2.4 1.3-5 1.4-8a7 7 0 0 0-.6-2.8" />
    </Svg>
  );
}

/** 加号 / 新增 */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}
