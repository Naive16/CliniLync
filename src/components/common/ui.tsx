import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'sm',
  icon,
  className = '',
  children,
  ...props
}) => (
  <button
    type={props.type || 'button'}
    className={`cl-ui-button cl-ui-button-${variant} cl-ui-button-${size} ${className}`.trim()}
    {...props}
  >
    {icon}
    {children}
  </button>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...props }) => (
  <div className={`cl-ui-card ${className}`.trim()} {...props}>{children}</div>
);

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, eyebrow, actions, className = '' }) => (
  <header className={`cl-ui-page-header ${className}`.trim()}>
    <div className="cl-ui-page-header-copy">
      {eyebrow && <div className="cl-ui-eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="cl-ui-page-header-actions">{actions}</div>}
  </header>
);

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const StatusBadge: React.FC<{ children: React.ReactNode; tone?: StatusTone; className?: string }> = ({
  children,
  tone = 'neutral',
  className = ''
}) => <span className={`cl-ui-status cl-ui-status-${tone} ${className}`.trim()}>{children}</span>;

export const LoadingState: React.FC<{ children?: React.ReactNode }> = ({ children = 'Loading…' }) => (
  <div className="cl-ui-state cl-ui-loading" role="status" aria-live="polite">
    <span className="cl-ui-spinner" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export const EmptyState: React.FC<{ title: string; description?: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  description,
  action
}) => (
  <div className="cl-ui-state cl-ui-empty-state">
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action && <div className="cl-ui-state-action">{action}</div>}
  </div>
);

export const Alert: React.FC<{ tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode }> = ({
  tone = 'info',
  children
}) => <div className={`cl-ui-alert cl-ui-alert-${tone}`} role="status">{children}</div>;
