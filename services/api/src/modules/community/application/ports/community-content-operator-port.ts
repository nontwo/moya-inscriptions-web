import type {
  OperatorWorksQuery,
  OperatorFeaturedQuery,
  OperatorUsersQuery,
  OperatorUserPage,
  RecommendUserCommand,
  OperatorWork,
  OperatorWorkPage,
  ModerateWorkCommand,
  FeaturedMutation,
  FeaturedSettingsMutation,
  FeaturedPage,
} from "@moya/contracts/internal/community-operator";
export interface CommunityContentOperatorPort {
  readWorkTitle(id: string): Promise<string | null>;
  readWorks(query: OperatorWorksQuery): Promise<OperatorWorkPage>;
  readUsers(query: OperatorUsersQuery): Promise<OperatorUserPage>;
  recommendUser(
    operator: string,
    input: RecommendUserCommand,
  ): Promise<{ version: number }>;
  moderateWork(
    id: string,
    operator: string,
    input: ModerateWorkCommand,
  ): Promise<OperatorWork>;
  readFeatured(query: OperatorFeaturedQuery): Promise<FeaturedPage>;
  setFeatured(
    operator: string,
    input: FeaturedMutation,
  ): Promise<{ version: number }>;
  setFeaturedQuantity(
    operator: string,
    input: FeaturedSettingsMutation,
  ): Promise<{ version: number }>;
}
