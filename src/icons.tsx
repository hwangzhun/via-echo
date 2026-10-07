// Import individual Phosphor components to keep dev and production bundles focused.
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowFatUpIcon } from "@phosphor-icons/react/dist/csr/ArrowFatUp";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowLineDownIcon } from "@phosphor-icons/react/dist/csr/ArrowLineDown";
import { ArrowLineRightIcon } from "@phosphor-icons/react/dist/csr/ArrowLineRight";
import { ArrowLineUpIcon } from "@phosphor-icons/react/dist/csr/ArrowLineUp";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { BackspaceIcon } from "@phosphor-icons/react/dist/csr/Backspace";
import { CursorClickIcon } from "@phosphor-icons/react/dist/csr/CursorClick";
import { DiamondsFourIcon } from "@phosphor-icons/react/dist/csr/DiamondsFour";
import { GearIcon } from "@phosphor-icons/react/dist/csr/Gear";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
import { KeyReturnIcon } from "@phosphor-icons/react/dist/csr/KeyReturn";
import { KeyboardIcon } from "@phosphor-icons/react/dist/csr/Keyboard";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PaletteIcon } from "@phosphor-icons/react/dist/csr/Palette";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { TextAlignJustifyIcon } from "@phosphor-icons/react/dist/csr/TextAlignJustify";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";

export { GearIcon, MinusIcon, XIcon, KeyboardIcon, SlidersHorizontalIcon, InfoIcon, CursorClickIcon, ArrowSquareOutIcon, ArrowCounterClockwiseIcon, ArrowClockwiseIcon };

const bindingIcons = {
  "↵": KeyReturnIcon,
  "⌫": BackspaceIcon,
  "⇥": ArrowLineRightIcon,
  "␣": TextAlignJustifyIcon,
  "⇞": ArrowLineUpIcon,
  "⇟": ArrowLineDownIcon,
  "⌦": XIcon,
  "→": ArrowRightIcon,
  "←": ArrowLeftIcon,
  "↓": ArrowDownIcon,
  "↑": ArrowUpIcon,
  "⇧": ArrowFatUpIcon,
  "◈": StackIcon,
  "◇": DiamondsFourIcon,
  "◉": PaletteIcon,
  "?": QuestionIcon,
};

/** Keep the persisted keymap format; render legacy icon hints with Phosphor SVGs. */
export function BindingIcon({ glyph }: { glyph: string }) {
  const Icon = bindingIcons[glyph as keyof typeof bindingIcons];
  return Icon ? <Icon className="binding-icon" aria-hidden="true" weight="regular" /> : null;
}
