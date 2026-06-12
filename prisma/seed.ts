// Database seed for EPS.
// P0 placeholder: real seed data (test orgs, Stripe price refs, etc.) is added
// in later phases. For now it just confirms the seed pipeline runs end-to-end.
async function main() {
  console.log("seed ok");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
