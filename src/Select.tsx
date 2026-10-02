import {
  Children,
  Fragment,
  isValidElement,
  useMemo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type SelectOption = { value: string; label: ReactNode; text: string; disabled: boolean };

type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'children'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
};

function optionText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return isValidElement<{ children?: ReactNode }>(child)
        ? optionText(child.props.children)
        : '';
    })
    .join('');
}

function collectOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment) {
      options.push(...collectOptions(child.props.children));
    } else if (child.type === 'option') {
      const text = optionText(child.props.children);
      options.push({
        value: String(child.props.value ?? text),
        label: child.props.children,
        text,
        disabled: Boolean(child.props.disabled),
      });
    }
  });
  return options;
}

/** Styled select with shared pointer, keyboard, focus and form behavior in every browser. */
export function Select({
  value,
  onValueChange,
  children,
  id,
  name,
  form,
  required,
  readOnly,
  disabled,
  autoComplete,
  className = '',
  ...triggerProps
}: SelectProps) {
  // Option children describe the choices; no native select or OS menu is rendered.
  const options = useMemo(() => collectOptions(children), [children]);
  return (
    <SelectPrimitive.Root
      id={id}
      name={name}
      form={form}
      value={String(value)}
      items={options}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      autoComplete={autoComplete}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue);
      }}
    >
      <SelectPrimitive.Trigger
        {...triggerProps}
        type="button"
        className={`select-trigger ${className}`}
      >
        <SelectPrimitive.Value className="select-value" />
        <SelectPrimitive.Icon className="select-chevron">
          <ChevronDown size={14} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="select-positioner"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup className="select-popup">
            <SelectPrimitive.List className="select-list">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  label={option.text}
                  disabled={option.disabled}
                  className="select-item"
                >
                  <SelectPrimitive.ItemText className="select-item-text">
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="select-item-indicator">
                    <Check size={14} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
