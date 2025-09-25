export const trpc = {
  applications: {
    list: {
      useQuery: () => ({
        data: [
          { id: "acme-se",   company: "Acme",   role: "Software Engineer", status: "APPLIED",   updated: "2025-09-01" },
          { id: "globex-pm", company: "Globex", role: "Product Manager",   status: "INTERVIEW", updated: "2025-09-10" },
        ],
        isLoading: false,
        isError: false,
        error: null,
      }),
    },
  },
};
