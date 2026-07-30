import { PlayJoinPage } from "@/ui/PlayJoinPage";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function PlayCodePage({ params }: PageProps) {
  const { code } = await params;
  return <PlayJoinPage code={code} />;
}
