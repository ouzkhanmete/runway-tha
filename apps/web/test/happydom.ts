import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as any).document) {
  GlobalRegistrator.register();
}
