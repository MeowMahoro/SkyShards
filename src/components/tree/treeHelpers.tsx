import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Data, InventoryRecipeTree, Recipe, RecipeTree, Shard } from "../../types/types";

/**
 * Shared expand/collapse state for a recipe tree, owned by the page that renders
 * it (calculator Fusion Tree, arbitrage Fusion path). Initialises every recipe
 * node expanded and resets whenever a new tree object arrives.
 */
export const useTreeExpansion = (tree: RecipeTree | null) => {
  const [expandedStates, setExpandedStates] = React.useState<Map<string, boolean>>(new Map());
  const [lastTreeHash, setLastTreeHash] = React.useState<string>("");

  const initializeExpandedStates = (tree: RecipeTree, nodeId: string = "root"): Map<string, boolean> => {
    const states = new Map<string, boolean>();
    const traverse = (node: RecipeTree, id: string) => {
      if (node.method === "recipe" && node.inputs) {
        states.set(id, true);
        node.inputs.forEach((input, index) => {
          traverse(input, `${id}-${index}`);
        });
      }
    };
    traverse(tree, nodeId);
    return states;
  };

  React.useEffect(() => {
    if (tree) {
      const treeHash = JSON.stringify(tree);
      if (treeHash !== lastTreeHash) {
        const initialStates = initializeExpandedStates(tree);
        setExpandedStates(initialStates);
        setLastTreeHash(treeHash);
      }
    }
  }, [tree, lastTreeHash]);

  const handleExpandAll = () => {
    const newStates = new Map(expandedStates);
    for (const key of newStates.keys()) {
      newStates.set(key, true);
    }
    setExpandedStates(newStates);
  };

  const handleCollapseAll = () => {
    const newStates = new Map(expandedStates);
    for (const key of newStates.keys()) {
      newStates.set(key, false);
    }
    setExpandedStates(newStates);
  };

  const handleNodeToggle = (nodeId: string) => {
    const newStates = new Map(expandedStates);
    newStates.set(nodeId, !newStates.get(nodeId));
    setExpandedStates(newStates);
  };

  return { expandedStates, handleExpandAll, handleCollapseAll, handleNodeToggle };
};

/**
 * Non-component helpers used by both tree renderers. Kept out of shared.tsx so that
 * file exports only components (react-refresh/only-export-components).
 */

export const isReptileRecipe = (recipe: Recipe | undefined, input1Shard: Shard | undefined, input2Shard: Shard | undefined): boolean => {
  return (recipe?.isReptile || input1Shard?.family?.toLowerCase().includes("reptile") || input2Shard?.family?.toLowerCase().includes("reptile")) as boolean;
};

export const renderChevron = (isExpanded: boolean) => (isExpanded ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4 text-amber-400" />);

/**
 * Read a node's expand/collapse state, seeding a default the first time an id is seen.
 *
 * `expandedStates` is a plain Map owned by the page, held outside React state so
 * toggling one node doesn't rebuild the whole tree. Seeding a default is a write, and
 * writing during render is impure, so defaults are buffered in a ref and flushed in an
 * effect after commit.
 *
 * The Map must end up populated: the page's toggle handler computes the next value as
 * `!expandedStates.get(id)`, which would read `undefined` for an unseeded node and
 * flip a defaulted-open node straight back to open.
 */
export const useExpansionState = (expandedStates: Map<string, boolean>) => {
  const pendingDefaults = React.useRef<Map<string, boolean>>(new Map());

  React.useEffect(() => {
    if (pendingDefaults.current.size === 0) return;
    for (const [id, value] of pendingDefaults.current) {
      if (!expandedStates.has(id)) {
        expandedStates.set(id, value);
      }
    }
    pendingDefaults.current.clear();
  });

  return (id: string, defaultState: boolean = true): boolean => {
    if (expandedStates.has(id)) {
      return expandedStates.get(id)!;
    }
    pendingDefaults.current.set(id, defaultState);
    return defaultState;
  };
};

/**
 * How many Pure Reptile procs the player needs for this node, or null when
 * Crocodile can't double anything here.
 *
 * Typed against InventoryRecipeTree because that is the wider of the two trees — a
 * RecipeTree is structurally assignable to it, and its inputs are never arrays, so
 * the array guards below simply never fire for the plain renderer.
 */
export const getCrocodileProcs = (tree: InventoryRecipeTree, data: Data): number | null => {
  if (Array.isArray(tree)) return null;

  if (tree.method === "cycle") {
    const hasReptile = tree.steps.some((step) => {
      const recipe = step.recipe;
      const input1Shard = data.shards[recipe.inputs[0]];
      const input2Shard = data.shards[recipe.inputs[1]];
      return isReptileRecipe(recipe, input1Shard, input2Shard);
    });
    return hasReptile ? Math.ceil(tree.quantity / 2) : null;
  }

  if (tree.method === "recipe") {
    const recipe = tree.recipe;
    const input1Shard = data.shards[recipe.inputs[0]];
    const input2Shard = data.shards[recipe.inputs[1]];
    if (isReptileRecipe(recipe, input1Shard, input2Shard)) {
      const requiredOutputQuantity = tree.quantity;
      let inputQuantityOfReptile = 0;
      let inputFuseAmount = 0;
      if (input1Shard?.family?.toLowerCase().includes("reptile")) {
        inputQuantityOfReptile = Array.isArray(tree.inputs[0]) ? 0 : tree.inputs[0].quantity;
        inputFuseAmount = input1Shard.fuse_amount;
      } else if (input2Shard?.family?.toLowerCase().includes("reptile")) {
        inputQuantityOfReptile = Array.isArray(tree.inputs[1]) ? 0 : tree.inputs[1].quantity;
        inputFuseAmount = input2Shard.fuse_amount;
      }
      return Math.ceil(requiredOutputQuantity / tree.recipe.outputQuantity - inputQuantityOfReptile / inputFuseAmount);
    }
  }

  return null;
};
