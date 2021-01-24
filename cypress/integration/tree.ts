describe('Tree', () => {
  it('Visit the tree page', () => {
    cy.visit('/classic/tree');
    cy.get('#jp-ClassicLogo', { timeout: 5000 });
    cy.screenshot();
  });
});
