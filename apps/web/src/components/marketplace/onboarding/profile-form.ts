import { MARKETPLACE_COMPANY_SIZES, MARKETPLACE_INDUSTRIES } from "@/constants/marketplace";

export interface IProfileFormValues {
  display_name: string;
  title: string;
  hourly_rate: string;
  skills: string[];
  company_name: string;
  industry: string;
  company_size: string;
}

export const EMPTY_PROFILE_FORM: IProfileFormValues = {
  display_name: "",
  title: "",
  hourly_rate: "",
  skills: [],
  company_name: "",
  industry: MARKETPLACE_INDUSTRIES[0],
  company_size: MARKETPLACE_COMPANY_SIZES[0],
};
