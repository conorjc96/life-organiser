import React, { useEffect, useMemo, useState } from 'react';
import { getFoodLog, getFoods, createFoodEntry, deleteFoodEntry, createFood } from '../api/notion';
import { todayDateString } from '../utils/schedule';
import './FoodScreen.css';

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// Trying to hit 140-150g protein/day — see the progress bar at the top.
const PROTEIN_GOAL_MIN = 140;
const PROTEIN_GOAL_MAX = 150;

function emptyDrafts() {
  return { Breakfast: '', Lunch: '', Dinner: '', Snack: '' };
}

function emptyNewFood() {
  return { name: '', calories: '', protein: '', carbs: '', fat: '' };
}

function round(n) {
  return Math.round(n * 10) / 10;
}

// "250 cal · 45p · 0c · 6f" — omits whichever macros aren't set on the food.
function formatPreview(food) {
  if (!food) return null;
  const parts = [];
  if (food.calories != null) parts.push(`${food.calories} cal`);
  if (food.protein != null) parts.push(`${food.protein}p`);
  if (food.carbs != null) parts.push(`${food.carbs}c`);
  if (food.fat != null) parts.push(`${food.fat}f`);
  return parts.length > 0 ? parts.join(' · ') : 'No calories/macros saved for this food yet';
}

function FoodScreen({ showDateNav = true }) {
  const [date, setDate] = useState(todayDateString);
  const [entries, setEntries] = useState([]);
  const [foods, setFoods] = useState([]);
  const [state, setState] = useState('loading');
  const [drafts, setDrafts] = useState(emptyDrafts);
  const [loggingMeal, setLoggingMeal] = useState(null);

  const [addingFood, setAddingFood] = useState(false);
  const [newFood, setNewFood] = useState(emptyNewFood);
  const [savingFood, setSavingFood] = useState(false);
  const [newFoodError, setNewFoodError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState('loading');
    Promise.all([getFoodLog({ date, signal }), getFoods({ signal })])
      .then(([entryList, foodList]) => {
        setEntries(entryList);
        setFoods(foodList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load food log', err);
        setState('error');
      });
    return () => controller.abort();
  }, [date]);

  const entriesByMeal = useMemo(() => {
    const map = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
    for (const entry of entries) {
      const meal = MEALS.includes(entry.meal) ? entry.meal : 'Snack';
      map[meal].push(entry);
    }
    return map;
  }, [entries]);

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, e) => ({
        calories: acc.calories + (e.calories || 0),
        protein: acc.protein + (e.protein || 0),
        carbs: acc.carbs + (e.carbs || 0),
        fat: acc.fat + (e.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [entries]);

  const proteinProgress = Math.min(100, (totals.protein / PROTEIN_GOAL_MIN) * 100);

  const sortedFoods = useMemo(
    () => [...foods].sort((a, b) => a.name.localeCompare(b.name)),
    [foods]
  );

  const selectFood = (meal, foodId) => {
    setDrafts((prev) => ({ ...prev, [meal]: foodId }));
  };

  // Logging always pulls calories/macros from the selected food's Notion
  // record — foodName is sent, not the numbers, so api/food-log.js's
  // findOrCreateFood matches the existing food and copies its stored
  // values onto the new entry. Nothing is typed or overridden here by
  // design: the user maintains real numbers in the Foods database
  // directly in Notion, not per log entry.
  const submitDraft = async (meal) => {
    const foodId = drafts[meal];
    const food = foods.find((f) => f.id === foodId);
    if (!food || loggingMeal) return;
    setLoggingMeal(meal);
    try {
      const entry = await createFoodEntry({ foodName: food.name, date, meal });
      setEntries((prev) => [entry, ...prev]);
      setDrafts((prev) => ({ ...prev, [meal]: '' }));
    } catch (err) {
      console.error('Failed to log food entry', err);
    } finally {
      setLoggingMeal(null);
    }
  };

  const submitNewFood = async () => {
    const name = newFood.name.trim();
    if (!name || savingFood) return;
    setSavingFood(true);
    setNewFoodError(null);
    try {
      const food = await createFood({
        name,
        calories: newFood.calories,
        protein: newFood.protein,
        carbs: newFood.carbs,
        fat: newFood.fat,
      });
      setFoods((prev) => [...prev, food]);
      setNewFood(emptyNewFood());
      setAddingFood(false);
    } catch (err) {
      console.error('Failed to create food', err);
      setNewFoodError(err.message || 'Failed to create food');
    } finally {
      setSavingFood(false);
    }
  };

  const removeEntry = async (id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteFoodEntry(id);
    } catch (err) {
      console.error('Failed to delete food entry', err);
    }
  };

  return (
    <div className="food-screen">
      {showDateNav && (
        <div className="food-date-row">
          <button
            type="button"
            className="food-date-arrow"
            onClick={() => setDate((d) => addDays(d, -1))}
          >
            ‹
          </button>
          <input type="date" className="food-date-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <button type="button" className="food-date-arrow" onClick={() => setDate((d) => addDays(d, 1))}>
            ›
          </button>
        </div>
      )}

      <div className="food-totals-card">
        <div className="food-totals-row">
          <div className="food-total-stat">
            <span className="food-total-value">{round(totals.calories)}</span>
            <span className="food-total-label">Calories</span>
          </div>
          <div className="food-total-stat">
            <span className="food-total-value">{round(totals.carbs)}g</span>
            <span className="food-total-label">Carbs</span>
          </div>
          <div className="food-total-stat">
            <span className="food-total-value">{round(totals.fat)}g</span>
            <span className="food-total-label">Fat</span>
          </div>
        </div>
        <div className="food-protein-goal">
          <div className="food-protein-goal-label">
            <span>Protein</span>
            <span>
              {round(totals.protein)}g / {PROTEIN_GOAL_MIN}-{PROTEIN_GOAL_MAX}g
            </span>
          </div>
          <div className="food-protein-track">
            <div className="food-protein-fill" style={{ width: `${proteinProgress}%` }} />
          </div>
        </div>
      </div>

      {state === 'loading' && <p className="section-status">Loading your food log…</p>}
      {state === 'error' && (
        <p className="section-status section-status--error">Couldn't load the food log from Notion.</p>
      )}
      {state === 'ready' && foods.length === 0 && !addingFood && (
        <p className="section-status">No foods yet — add your first one below.</p>
      )}

      {state === 'ready' && (
        <div className="food-manage">
          <button
            type="button"
            className="food-manage-toggle"
            onClick={() => {
              setAddingFood((prev) => !prev);
              setNewFoodError(null);
            }}
          >
            {addingFood ? 'Cancel' : '+ Add new food'}
          </button>
          {addingFood && (
            <div className="food-new-form">
              <input
                type="text"
                className="food-name-input"
                placeholder="Food name…"
                value={newFood.name}
                onChange={(e) => setNewFood((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <div className="food-new-row">
                <input
                  type="number"
                  className="food-number-input"
                  placeholder="Cal"
                  value={newFood.calories}
                  onChange={(e) => setNewFood((f) => ({ ...f, calories: e.target.value }))}
                />
                <input
                  type="number"
                  className="food-number-input"
                  placeholder="Protein"
                  value={newFood.protein}
                  onChange={(e) => setNewFood((f) => ({ ...f, protein: e.target.value }))}
                />
                <input
                  type="number"
                  className="food-number-input"
                  placeholder="Carbs"
                  value={newFood.carbs}
                  onChange={(e) => setNewFood((f) => ({ ...f, carbs: e.target.value }))}
                />
                <input
                  type="number"
                  className="food-number-input"
                  placeholder="Fat"
                  value={newFood.fat}
                  onChange={(e) => setNewFood((f) => ({ ...f, fat: e.target.value }))}
                />
              </div>
              {newFoodError && <p className="section-status section-status--error">{newFoodError}</p>}
              <button
                type="button"
                className="food-add-button"
                disabled={!newFood.name.trim() || savingFood}
                onClick={submitNewFood}
              >
                {savingFood ? 'Saving…' : 'Save food'}
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'ready' &&
        MEALS.map((meal) => {
          const selectedFood = foods.find((f) => f.id === drafts[meal]);
          return (
            <section key={meal} className="food-meal-section">
              <h2 className="food-meal-title">{meal}</h2>
              {entriesByMeal[meal].length > 0 && (
                <ul className="food-entry-list">
                  {entriesByMeal[meal].map((entry) => (
                    <li key={entry.id} className="food-entry">
                      <span className="food-entry-name">{entry.name}</span>
                      <span className="food-entry-stats">
                        {entry.calories != null && `${entry.calories} cal`}
                        {entry.protein != null && ` · ${entry.protein}p`}
                        {entry.carbs != null && ` · ${entry.carbs}c`}
                        {entry.fat != null && ` · ${entry.fat}f`}
                      </span>
                      <button
                        type="button"
                        className="food-delete-btn"
                        aria-label="Delete entry"
                        onClick={() => removeEntry(entry.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {foods.length > 0 && (
                <div className="food-add-row">
                  <select
                    className="food-select"
                    value={drafts[meal]}
                    onChange={(e) => selectFood(meal, e.target.value)}
                  >
                    <option value="">Pick a food…</option>
                    {sortedFoods.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="food-add-button"
                    disabled={!drafts[meal] || loggingMeal === meal}
                    onClick={() => submitDraft(meal)}
                  >
                    {loggingMeal === meal ? '…' : 'Add'}
                  </button>
                </div>
              )}
              {selectedFood && <p className="food-preview">{formatPreview(selectedFood)}</p>}
            </section>
          );
        })}
    </div>
  );
}

function addDays(dateString, delta) {
  const [y, m, d] = dateString.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, '0');
  const nd = String(next.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export default FoodScreen;
