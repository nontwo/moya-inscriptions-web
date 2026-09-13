import type {
  OperatorContentQuery,
  OperatorWork,
  OperatorWorkPage,
  ModerateWorkCommand,
  FeaturedMutation,
  FeaturedSettingsMutation,
  FeaturedPage,
} from "@moya/contracts/internal/community-operator";
export interface CommunityContentOperatorPort {
  readWorkTitle(id: string): Promise<string | null>;
  readWorks(query: OperatorContentQuery): Promise<OperatorWorkPage>;
  moderateWork(
    id: string,
    operator: string,
    input: ModerateWorkCommand,
  ): Promise<OperatorWork>;
  readFeatured(query: OperatorContentQuery): Promise<FeaturedPage>;
  setFeatured(
    operator: string,
    input: FeaturedMutation,
  ): Promise<{ version: number }>;
  setFeaturedQuantity(
    operator: string,
    input: FeaturedSettingsMutation,
  ): Promise<{ version: number }>;
}
