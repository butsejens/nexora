declare module "expo-router" {
  export const Tabs: any;
  export const Stack: any;
  export const Link: any;
  export const router: any;
  export function useRouter(): any;
  export function useFocusEffect(effect: any): void;
  export function useRootNavigationState(): any;
  export function usePathname(): string;
  export function useLocalSearchParams<T = Record<string, any>>(): T;
  export default {};
}
