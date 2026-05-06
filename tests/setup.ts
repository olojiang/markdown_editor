import { vi } from 'vitest';

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('__APP_VERSION__', '0.1.4');
Element.prototype.scrollIntoView = vi.fn();
